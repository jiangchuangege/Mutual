/**
 * ConnectionManager：统一管理 WebSocket 长连接的创建 / 发送 / 接收 / 销毁。
 *
 * 为什么单独抽一个类：
 * - 公网不稳定，Socket 会莫名其妙半死（onclose 不触发、send 也不报错），
 *   所以重连逻辑不能散落在 store 里，必须有一个地方统一负责"什么时候连、什么时候退避、什么时候放弃"。
 * - 它不依赖 React、不依赖 AsyncStorage、也不直接认识 Hub；把环境（定时器、Socket 构造器）
 *   注入进来，就能在 node 里用假 Socket 做确定性测试（见 tests/connection.test.js）。
 */

import { toWebSocketUrl } from './serverUrl';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** 只依赖这几个成员：浏览器 / React Native / node 的 WebSocket 都满足 */
export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface ConnectionEnv {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  createSocket: (url: string) => SocketLike;
}

export const SOCKET_OPEN = 1;

/** 2s → 4s → 8s → 16s → 30s(封顶) → 30s … */
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 30_000;

/**
 * 指数退避：第 n 次重试等待 min(max, base * 2^(n-1))。
 * jitterRatio > 0 时在结果上抖动，但**抖动后也不会超过 max**。
 */
export function backoffDelay(
  attempt: number,
  base: number = BACKOFF_BASE_MS,
  max: number = BACKOFF_MAX_MS,
  jitterRatio = 0,
  random: () => number = Math.random,
): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = base * 2 ** (n - 1);
  const capped = Math.min(max, raw);
  if (jitterRatio <= 0) return capped;
  const jitter = capped * Math.min(1, jitterRatio) * random();
  return Math.min(max, Math.round(capped - jitter));
}

export interface ConnectionOptions {
  /** http(s) 或 ws(s) 都可以，内部会统一转成 ws(s) */
  url: string;
  /** 自定义 WS 路径（服务端挂在 /ws 时传 '/ws'） */
  wsPath?: string;
  env?: Partial<ConnectionEnv>;
  /** 心跳间隔：定时发 ping，并顺手检查 readyState 是否已经半死 */
  heartbeatMs?: number;
  /** 发出 RPC 后多久没收到任何回包就判定假死（0 = 关闭该检测） */
  ackTimeoutMs?: number;
  /**
   * 静默多久算"连接已失联"。默认 heartbeatMs*2 + ackTimeoutMs。
   * 公网/移动网络下手机会短暂收不到东西（隧道缓冲、切网），
   * 阈值给得太小会误判成掉线，然后反复重连——这正是"一会就不稳定"的来源。
   */
  silenceLimitMs?: number;
  /** 建连超时：超过就当作失败进入退避 */
  connectTimeoutMs?: number;
  maxDelayMs?: number;
  baseDelayMs?: number;
  /**
   * 一条连接撑过多久才算"稳定"。短于这个时间又断了 = 抖动（网络/隧道抽风），
   * 连续抖动时会把退避往上抬，避免客户端疯狂重连把本就不稳的网络压垮。
   */
  stableMs?: number;
  /** 断线期间最多缓存多少条待发消息 */
  maxQueue?: number;
  jitterRatio?: number;
  random?: () => number;
}

export interface ConnectionStatusInfo {
  status: ConnectionStatus;
  /** 给 UI 直接显示的文案 */
  label: string;
  /** 指示灯颜色语义 */
  tone: 'ok' | 'warn' | 'danger' | 'muted';
  /** 距离下次重连还有多少毫秒（只有 reconnecting 有意义） */
  retryInMs: number;
  attempt: number;
  lastError: string | null;
  url: string;
}

type MessagePayload = Record<string, unknown>;

function defaultEnv(): ConnectionEnv {
  const g = globalThis as unknown as {
    WebSocket?: new (url: string) => SocketLike;
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (h: unknown) => void;
  };
  if (typeof g.WebSocket !== 'function') {
    throw new Error('当前运行环境没有 WebSocket，无法建立长连接');
  }
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: (h) => g.clearTimeout(h),
    createSocket: (url) => new (g.WebSocket as new (u: string) => SocketLike)(url),
  };
}

export class ConnectionManager {
  readonly httpUrl: string;
  readonly url: string;
  private env: ConnectionEnv;
  private opts: Required<
    Pick<
      ConnectionOptions,
      | 'heartbeatMs'
      | 'ackTimeoutMs'
      | 'silenceLimitMs'
      | 'connectTimeoutMs'
      | 'maxDelayMs'
      | 'baseDelayMs'
      | 'stableMs'
      | 'maxQueue'
      | 'jitterRatio'
    >
  >;
  private random: () => number;

  private socket: SocketLike | null = null;
  private status: ConnectionStatus = 'idle';
  private attempt = 0;
  private nextRetryAt = 0;
  private lastError: string | null = null;
  private everOpened = false;
  private manualClose = false;
  /** 本次连接是什么时候连上的（判断"撑了多久就断"）；null = 当前没有连上（不能用 0 当哨兵） */
  private openedAt: number | null = null;
  /** 连续"连上没多久就断"的次数（撑住一次就清零），用来抑制抖动式重连 */
  private shortDropStreak = 0;

  private connectTimer: unknown = null;
  private retryTimer: unknown = null;
  private heartbeatTimer: unknown = null;
  private lastInboundAt = 0;
  /** null 表示当前没有在等回包（不能用 0 当哨兵：假时钟/首包就可能等于 0） */
  private awaitingAckSince: number | null = null;

  private queue: string[] = [];

  private statusListeners = new Set<(s: ConnectionStatusInfo) => void>();
  private messageListeners = new Set<(msg: MessagePayload | null, raw: string) => void>();
  private openedListeners = new Set<() => void>();
  private resyncListeners = new Set<() => void>();

  constructor(options: ConnectionOptions) {
    this.env = { ...defaultEnv(), ...(options.env ?? {}) };
    this.httpUrl = options.url;
    this.url = /^wss?:\/\//i.test(options.url)
      ? options.url
      : toWebSocketUrl(options.url, options.wsPath);
    this.opts = {
      heartbeatMs: options.heartbeatMs ?? 20_000,
      ackTimeoutMs: options.ackTimeoutMs ?? 15_000,
      silenceLimitMs: options.silenceLimitMs ?? (options.heartbeatMs ?? 20_000) * 2 + (options.ackTimeoutMs ?? 15_000),
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      maxDelayMs: options.maxDelayMs ?? BACKOFF_MAX_MS,
      baseDelayMs: options.baseDelayMs ?? BACKOFF_BASE_MS,
      stableMs: options.stableMs ?? 15_000,
      maxQueue: options.maxQueue ?? 50,
      jitterRatio: options.jitterRatio ?? 0,
    };
    this.random = options.random ?? Math.random;
  }

  // ---------------------------------------------------------------------------
  // 订阅
  // ---------------------------------------------------------------------------

  onStatus(cb: (s: ConnectionStatusInfo) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onMessage(cb: (msg: MessagePayload | null, raw: string) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  /** 首次连上（或主动 connect 成功） */
  onOpened(cb: () => void): () => void {
    this.openedListeners.add(cb);
    return () => this.openedListeners.delete(cb);
  }

  /** 断线后**重连成功**：调用方在这里补发房间状态/播放进度做状态恢复 */
  onResync(cb: () => void): () => void {
    this.resyncListeners.add(cb);
    return () => this.resyncListeners.delete(cb);
  }

  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------

  get isOpen(): boolean {
    return this.status === 'open' && this.socket !== null && this.socket.readyState === SOCKET_OPEN;
  }

  get rawStatus(): ConnectionStatus {
    return this.status;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  statusInfo(): ConnectionStatusInfo {
    const retryInMs =
      this.status === 'reconnecting' ? Math.max(0, this.nextRetryAt - this.env.now()) : 0;
    const label =
      this.status === 'open'
        ? '已连接'
        : this.status === 'connecting'
          ? '连接中'
          : this.status === 'reconnecting'
            ? retryInMs > 0
              ? `重连中 ${Math.ceil(retryInMs / 1000)}s`
              : '重连中'
            : this.status === 'closed'
              ? '已断开'
              : '未连接';
    const tone =
      this.status === 'open'
        ? 'ok'
        : this.status === 'connecting' || this.status === 'reconnecting'
          ? 'warn'
          : this.status === 'closed'
            ? 'danger'
            : 'muted';
    return {
      status: this.status,
      label,
      tone,
      retryInMs,
      attempt: this.attempt,
      lastError: this.lastError,
      url: this.url,
    };
  }

  private emitStatus(): void {
    const info = this.statusInfo();
    for (const cb of [...this.statusListeners]) cb(info);
  }

  // ---------------------------------------------------------------------------
  // 连接 / 断开
  // ---------------------------------------------------------------------------

  connect(): void {
    if (this.status === 'open' || this.status === 'connecting') return;
    this.manualClose = false;
    this.attempt = 0;
    this.openSocket();
  }

  private openSocket(): void {
    this.clearTimer('connect');
    this.status = this.everOpened ? 'reconnecting' : 'connecting';
    this.emitStatus();

    let socket: SocketLike;
    try {
      socket = this.env.createSocket(this.url);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    this.connectTimer = this.env.setTimeout(() => {
      if (this.socket !== socket) return;
      this.lastError = '连接超时';
      this.hardClose(socket);
      this.scheduleReconnect();
    }, this.opts.connectTimeoutMs);

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.clearTimer('connect');
      const wasReconnect = this.everOpened;
      this.everOpened = true;
      this.status = 'open';
      this.attempt = 0;
      this.openedAt = this.env.now();
      this.nextRetryAt = 0;
      this.lastError = null;
      this.lastInboundAt = this.env.now();
      this.awaitingAckSince = null;
      this.emitStatus();
      // 先让上层发 hello（报身份），**再**补发断线期间排队的操作。
      // 反过来的话，排队的 rpc 会先到服务器、身份还是空的，
      // 用户就会看到「先发 hello 再发 rpc」这种红字，并且那次操作白丢
      // （真实事故：重连期间加/删安排）。
      if (wasReconnect) {
        for (const cb of [...this.resyncListeners]) cb();
      } else {
        for (const cb of [...this.openedListeners]) cb();
      }
      this.flushQueue();
      this.armHeartbeat();
    };

    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.lastInboundAt = this.env.now();
      this.awaitingAckSince = null;
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data ?? '');
      let parsed: MessagePayload | null = null;
      try {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          parsed = value as MessagePayload;
        }
      } catch {
        parsed = null;
      }
      for (const cb of [...this.messageListeners]) cb(parsed, raw);
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.lastError = '网络错误';
      this.hardClose(socket);
      this.scheduleReconnect();
    };

    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.lastError = ev?.reason ? String(ev.reason) : this.lastError ?? '连接已断开';
      this.hardClose(socket);
      if (this.manualClose) {
        this.status = 'closed';
        this.emitStatus();
        return;
      }
      this.scheduleReconnect();
    };
  }

  /** 关掉 socket 但保留 this.socket 引用清理逻辑，避免事件重入 */
  private hardClose(socket: SocketLike | null): void {
    this.clearTimer('connect');
    this.clearTimer('heartbeat');
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // 已经关掉了，忽略
    }
    if (this.socket === socket) this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.manualClose) {
      this.status = 'closed';
      this.emitStatus();
      return;
    }
    this.clearTimer('retry');
    this.attempt += 1;
    const now = this.env.now();
    // 抖动检测：连上没多久又断 → 记一笔；连续发生就把退避往上抬。
    // 否则每条连接只活 2 秒、每次都从 1 秒退避重新开始，就成了"连上—掉线—再连上"的死循环，
    // 公网隧道尤其明显（用户看到的就是"连上了但一会又不稳定"）。
    const lived = this.openedAt !== null ? now - this.openedAt : null;
    if (lived !== null) {
      if (lived < this.opts.stableMs) {
        // 连上没撑住又断了：网络/隧道在抽风
        this.shortDropStreak = Math.min(8, this.shortDropStreak + 1);
      } else {
        // 这次撑过了 stableMs，说明链路是好的，取消惩罚
        this.shortDropStreak = 0;
      }
    }
    this.openedAt = null;
    // 前两次抖动当作正常抖动（不加罚）；之后每抖一次多退避一档，最多压 6 档
    const flapPenalty = Math.min(6, Math.max(0, this.shortDropStreak - 2));
    const delay = backoffDelay(
      this.attempt + flapPenalty,
      this.opts.baseDelayMs,
      this.opts.maxDelayMs,
      this.opts.jitterRatio,
      this.random,
    );
    this.nextRetryAt = now + delay;
    this.status = 'reconnecting';
    this.emitStatus();
    this.retryTimer = this.env.setTimeout(() => {
      this.retryTimer = null;
      if (this.manualClose) return;
      this.openSocket();
    }, delay);
  }

  /** 立刻重连一次（用户点"重试"时用，不走退避） */
  retryNow(): void {
    if (this.status === 'open') return;
    this.manualClose = false;
    this.clearTimer('retry');
    this.hardClose(this.socket);
    this.openSocket();
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearTimer('retry');
    this.clearTimer('connect');
    this.clearTimer('heartbeat');
    this.hardClose(this.socket);
    this.queue = [];
    this.status = 'closed';
    this.nextRetryAt = 0;
    this.emitStatus();
  }

  destroy(): void {
    this.disconnect();
    this.statusListeners.clear();
    this.messageListeners.clear();
    this.openedListeners.clear();
    this.resyncListeners.clear();
  }

  private clearTimer(which: 'connect' | 'retry' | 'heartbeat'): void {
    const handle =
      which === 'connect' ? this.connectTimer : which === 'retry' ? this.retryTimer : this.heartbeatTimer;
    if (handle !== null && handle !== undefined) this.env.clearTimeout(handle);
    if (which === 'connect') this.connectTimer = null;
    if (which === 'retry') this.retryTimer = null;
    if (which === 'heartbeat') this.heartbeatTimer = null;
  }

  // ---------------------------------------------------------------------------
  // 心跳：既做保活，也用来抓"半死连接"
  // ---------------------------------------------------------------------------

  private armHeartbeat(): void {
    this.clearTimer('heartbeat');
    if (this.opts.heartbeatMs <= 0) return;
    this.heartbeatTimer = this.env.setTimeout(() => this.heartbeatTick(), this.opts.heartbeatMs);
  }

  private heartbeatTick(): void {
    this.heartbeatTimer = null;
    if (this.status !== 'open' || !this.socket) return;
    const now = this.env.now();

    // 1) socket 自己已经掉了（平台能检测到时最省事）
    if (this.socket.readyState !== SOCKET_OPEN) {
      this.lastError = '连接已失效';
      const socket = this.socket;
      this.hardClose(socket);
      this.scheduleReconnect();
      return;
    }

    // 2) 发过 RPC 却迟迟没有任何回包 → 判定假死，主动重连
    if (this.opts.ackTimeoutMs > 0 && this.awaitingAckSince !== null) {
      if (now - this.awaitingAckSince > this.opts.ackTimeoutMs) {
        this.lastError = '服务器无响应，正在重连';
        const socket = this.socket;
        this.hardClose(socket);
        this.scheduleReconnect();
        return;
      }
    }

    // 2b) 长时间**一条下行消息都没有** → 这条连接已经是"半死"的了。
    // 手机上最常见：切 Wi-Fi/4G、系统把 App 挂起、NAT 丢掉映射。这时候
    // socket.readyState 还是 OPEN、onclose 永远不来，界面会一直显示「已连接」
    // 但服务端推送一条都收不到（真实事故：一端新建安排，另一端纹丝不动）。
    //
    // 判定方式用"多久没收到任何东西"，而不是"这条 ping 有没有回"——
    // 因为心跳会不停刷新后者的时间戳，永远等不到超时。
    if (this.opts.ackTimeoutMs > 0) {
      const silentFor = now - this.lastInboundAt;
      if (silentFor > this.opts.silenceLimitMs) {
        this.lastError = '连接已失联（心跳无回应），正在重连';
        const socket = this.socket;
        this.hardClose(socket);
        this.scheduleReconnect();
        return;
      }
    }

    // 3) 正常保活
    this.sendRaw(JSON.stringify({ v: 1, type: 'ping', t: now }), false);
    this.armHeartbeat();
  }

  // ---------------------------------------------------------------------------
  // 发送
  // ---------------------------------------------------------------------------

  /**
   * 发一条 JSON。未连接时返回 false 并入队，连上后自动补发。
   * `expectAck` 为 true 时记录"等回包"时间点，用于假死检测。
   */
  send(message: MessagePayload, expectAck = false): boolean {
    return this.sendRaw(JSON.stringify(message), expectAck);
  }

  sendRaw(raw: string, expectAck = false): boolean {
    if (this.isOpen && this.socket) {
      try {
        this.socket.send(raw);
        if (expectAck) this.awaitingAckSince = this.env.now();
        return true;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        const socket = this.socket;
        this.hardClose(socket);
        this.scheduleReconnect();
        this.enqueue(raw);
        return false;
      }
    }
    this.enqueue(raw);
    return false;
  }

  private enqueue(raw: string): void {
    this.queue.push(raw);
    while (this.queue.length > this.opts.maxQueue) this.queue.shift();
  }

  private flushQueue(): void {
    if (!this.isOpen || !this.socket) return;
    const pending = this.queue;
    this.queue = [];
    for (const raw of pending) {
      try {
        this.socket.send(raw);
      } catch {
        // 发送失败就留在队列里，下次连上再发
        this.queue.push(raw);
        break;
      }
    }
  }
}
