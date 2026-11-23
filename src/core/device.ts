/**
 * ClientDevice —— 一台"手机"的本地逻辑
 *
 * 真实产品里这些代码跑在各自手机上；这里用同一进程模拟两台设备，
 * 但**时钟偏移、对时样本、播放抖动、漂移校准、掉线重连全部真实计算**。
 */

import { ClockSync } from './clockSync';
import { DriftController, computeTargetPosition } from './drift';
import type { Hub } from './hub';
import type { Role, SpaceSnapshot } from './types';

export type NoticeKind = 'resync' | 'degraded' | 'offline' | 'online' | 'info';

export interface DeviceNotice {
  id: string;
  at: number;
  kind: NoticeKind;
  text: string;
}

export interface DeviceMetrics {
  drift: number;
  target: number;
  local: number;
  mode: 'none' | 'soft' | 'hard';
  hardCount: number;
  degraded: boolean;
  rtt: number;
  offset: number;
  clockSynced: boolean;
  isLeader: boolean;
  playing: boolean;
  rate: number;
}

export interface DeviceOptions {
  role: Role;
  hub: Hub;
  /** 设备时钟相对服务端的偏移（正数表示设备时钟偏快） */
  clockSkewMs?: number;
  /** 本机播放器实际速率系数，制造真实的并发播放差异 */
  playbackFactor?: number;
  now?: () => number;
}

let noticeSeq = 0;

export class ClientDevice {
  readonly role: Role;
  private readonly hub: Hub;
  private readonly nowFn: () => number;
  readonly clockSkewMs: number;
  private readonly playbackFactor: number;

  readonly clock = new ClockSync();
  readonly driftCtl = new DriftController();
  snapshot: SpaceSnapshot;
  notices: DeviceNotice[] = [];
  online = true;

  readonly player = { positionSec: 0, playing: false, rate: 1 };

  private lastPingAt = 0;
  private lastHeartbeatAt = 0;
  private prevRoomState: string | null = null;
  private prevDegraded = false;
  private metricsCache: DeviceMetrics;

  constructor(opts: DeviceOptions) {
    this.role = opts.role;
    this.hub = opts.hub;
    this.nowFn = opts.now ?? (() => Date.now());
    this.clockSkewMs = opts.clockSkewMs ?? 0;
    this.playbackFactor = opts.playbackFactor ?? 1;
    this.snapshot = opts.hub.snapshot(opts.role);
    this.metricsCache = {
      drift: 0,
      target: 0,
      local: 0,
      mode: 'none',
      hardCount: 0,
      degraded: false,
      rtt: -1,
      offset: 0,
      clockSynced: false,
      isLeader: false,
      playing: false,
      rate: 1,
    };
    this.pingNow();
  }

  /** 本机时钟读数（含本地偏移，用来证明对时逻辑真的在起效） */
  localNow(): number {
    return this.nowFn() + this.clockSkewMs;
  }

  /** 估算的服务端时间 */
  serverNow(): number {
    return this.clock.serverNow(this.localNow());
  }

  pingNow(): void {
    for (let i = 0; i < 5; i += 1) {
      this.clock.add(this.hub.clockPing(this.role));
    }
    this.lastPingAt = this.nowFn();
  }

  get metrics(): DeviceMetrics {
    return this.metricsCache;
  }

  get serverNowMs(): number {
    return this.hub.now();
  }

  applySnapshot(snapshot: SpaceSnapshot): void {
    this.snapshot = snapshot;
  }

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) {
      this.pingNow();
      this.driftCtl.reset();
      this.pushNotice('online', '网络已恢复');
    } else {
      this.pushNotice('offline', '网络已断开');
    }
  }

  private pushNotice(kind: NoticeKind, text: string): void {
    noticeSeq += 1;
    this.notices.unshift({
      id: `n_${noticeSeq}`,
      at: this.nowFn(),
      kind,
      text,
    });
    if (this.notices.length > 24) this.notices.pop();
  }

  clearNotices(): void {
    this.notices = [];
  }

  seekLocal(positionSec: number): void {
    this.player.positionSec = Math.max(0, positionSec);
  }

  /** 每帧推进（由 AppStore 统一驱动） */
  tick(dtMs: number): void {
    const now = this.localNow();

    // 周期性重新对时（真实实现每 60 秒一次）
    if (this.nowFn() - this.lastPingAt > 30_000) {
      this.pingNow();
    }

    const room = this.snapshot.activeRoom;
    const wasRoomState = this.prevRoomState;
    this.prevRoomState = room ? room.state : null;

    if (!room) {
      this.player.playing = false;
      this.player.rate = 1;
      this.metricsCache = {
        ...this.metricsCache,
        drift: 0,
        mode: 'none',
        isLeader: false,
        playing: false,
        rate: 1,
        degraded: this.driftCtl.stats.degraded,
        hardCount: this.driftCtl.stats.hardCount,
        rtt: this.clock.quality.rtt,
        offset: this.clock.offset,
        clockSynced: this.clock.quality.samples > 0 && !this.clock.quality.degraded,
      };
      return;
    }

    // 重连成功 → 强制重新校准并提示
    const justReconnected =
      (wasRoomState === 'PEER_OFFLINE' || wasRoomState === 'WAITING_RECONNECT') &&
      (room.state === 'PLAYING' || room.state === 'PAUSED');
    if (justReconnected) {
      this.driftCtl.reset();
      this.pingNow();
      this.pushNotice('resync', '已重新同步');
    }
    if (wasRoomState === 'COUNTDOWN' && room.state === 'PLAYING') {
      this.driftCtl.reset();
      this.player.positionSec = 0;
      this.pushNotice('info', '开始播放');
    }

    const isLeader = room.leaderRole === this.role;
    const inPlayback =
      room.state === 'PLAYING' ||
      room.state === 'PAUSED' ||
      room.state === 'PEER_OFFLINE' ||
      room.state === 'WAITING_RECONNECT';

    if (!inPlayback) {
      this.player.playing = false;
      /*
       * 倒计时/结算/结束这几个状态以前直接 return，metricsCache 里还留着上一局的
       * drift / mode / target —— 房间页会显示"偏差 3.2s / 硬同步"，用户以为
       * "还没开始就不同步"。这里把易变字段清零，和"没有房间"那条分支保持一致。
       */
      this.metricsCache = {
        ...this.metricsCache,
        drift: 0,
        target: 0,
        local: this.player.positionSec,
        mode: 'none',
        rate: 1,
        playing: false,
        isLeader: room.leaderRole === this.role,
        hardCount: 0,
        degraded: false,
      };
      return;
    }

    const targetRaw = computeTargetPosition(room.mediaState, this.serverNow());
    const target = targetRaw + room.mediaOffset[this.role];
    const shouldPlay = room.mediaState.action === 'play';

    // 本机播放器推进（带本机速率差异，制造真实漂移）
    if (this.player.playing) {
      this.player.positionSec += (dtMs / 1000) * this.player.rate * this.playbackFactor;
    }

    if (isLeader) {
      this.player.playing = shouldPlay;
      this.player.rate = 1;
      const drift = this.player.positionSec - target;
      // 主控是播放位置的来源：**不把主控拉回服务端位置**。
      // 如果把主控拉回，用户拖动自己的播放器后会被"弹回去"，体感就是 App 坏了。
      // 正确做法：主控通过心跳把真实位置推给服务端，由服务端 adoption（偏差 > 3s 时采纳）。
      if (this.nowFn() - this.lastHeartbeatAt > Math.max(200, this.hub.scaled(2000))) {
        this.hub.heartbeat(this.role, this.player.positionSec, this.player.playing);
        this.lastHeartbeatAt = this.nowFn();
      }
      this.metricsCache = {
        drift,
        target: targetRaw,
        local: this.player.positionSec,
        mode: 'none',
        hardCount: this.driftCtl.stats.hardCount,
        degraded: this.driftCtl.stats.degraded,
        rtt: this.clock.quality.rtt,
        offset: this.clock.offset,
        clockSynced: this.clock.quality.samples > 0 && !this.clock.quality.degraded,
        isLeader: true,
        playing: this.player.playing,
        rate: this.player.rate,
      };
      return;
    }

    // ---- 跟随端：三档校准 ----
    if (!shouldPlay) {
      this.player.playing = false;
      this.player.rate = 1;
      const gap = Math.abs(this.player.positionSec - target);
      if (gap > 0.5) this.player.positionSec = target;
      this.metricsCache = {
        drift: this.player.positionSec - target,
        target: targetRaw,
        local: this.player.positionSec,
        mode: 'none',
        hardCount: this.driftCtl.stats.hardCount,
        degraded: this.driftCtl.stats.degraded,
        rtt: this.clock.quality.rtt,
        offset: this.clock.offset,
        clockSynced: this.clock.quality.samples > 0 && !this.clock.quality.degraded,
        isLeader: false,
        playing: false,
        rate: 1,
      };
      return;
    }

    this.player.playing = true;
    const decision = this.driftCtl.decide(this.player.positionSec, target, now);

    if (decision.mode === 'hard' && decision.seekTo !== null) {
      this.player.positionSec = decision.seekTo;
      this.player.rate = 1;
      this.pushNotice('resync', '已重新同步');
    } else if (decision.mode === 'soft') {
      this.player.rate = decision.targetRate;
    } else {
      this.player.rate = 1;
    }

    if (decision.degraded && !this.prevDegraded) {
      this.pushNotice('degraded', '网络波动，同步精度下降至 ±2.5 秒');
    }
    this.prevDegraded = decision.degraded;

    this.metricsCache = {
      drift: decision.drift,
      target: targetRaw,
      local: this.player.positionSec,
      mode: decision.mode,
      hardCount: this.driftCtl.stats.hardCount,
      degraded: decision.degraded,
      rtt: this.clock.quality.rtt,
      offset: this.clock.offset,
      clockSynced: this.clock.quality.samples > 0 && !this.clock.quality.degraded,
      isLeader: false,
      playing: this.player.playing,
      rate: this.player.rate,
    };
  }
}
