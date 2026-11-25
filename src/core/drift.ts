/**
 * 播放漂移控制（方案 §2.1.3 三档校准）
 *
 * |drift| < 0.6s        → 忽略
 * 0.6s ~ 1.5s          → 软校准：本机速率临时 ±0.05，最多 5 秒追平后恢复
 * > 1.5s               → 硬校准：seek 到目标位置，并提示「已重新同步」
 * 硬校准防抖：30 秒内最多 1 次；超限降级为软校准，阈值放宽到 2.5s（诚实告知精度下降）
 */

export const DRIFT_CONST = {
  IGNORE_SEC: 0.6,
  HARD_SEC: 1.5,
  RELAXED_HARD_SEC: 2.5,
  SOFT_RATE_DELTA: 0.05,
  SOFT_WINDOW_MS: 5000,
  HARD_COOLDOWN_MS: 30000,
} as const;

export type DriftMode = 'none' | 'soft' | 'hard';

export interface DriftDecision {
  drift: number;
  absDrift: number;
  mode: DriftMode;
  targetRate: number;
  degraded: boolean;
  seekTo: number | null;
}

export class DriftController {
  private lastHardAt = Number.NEGATIVE_INFINITY;
  private hardCount = 0;
  private softUntil = 0;
  private softRate = 1;
  private degraded = false;

  reset(): void {
    this.lastHardAt = Number.NEGATIVE_INFINITY;
    this.hardCount = 0;
    this.softUntil = 0;
    this.softRate = 1;
    this.degraded = false;
  }

  get stats(): { hardCount: number; degraded: boolean; softRate: number } {
    return { hardCount: this.hardCount, degraded: this.degraded, softRate: this.softRate };
  }

  decide(localPos: number, targetPos: number, now: number): DriftDecision {
    const drift = localPos - targetPos;
    const absDrift = Math.abs(drift);
    const threshold = this.degraded ? DRIFT_CONST.RELAXED_HARD_SEC : DRIFT_CONST.HARD_SEC;

    // 软校准进行中：只要还在窗口内且未收敛，就继续保持速率
    if (this.softRate !== 1 && now < this.softUntil && absDrift > DRIFT_CONST.IGNORE_SEC) {
      return {
        drift,
        absDrift,
        mode: 'soft',
        targetRate: this.softRate,
        degraded: this.degraded,
        seekTo: null,
      };
    }

    // 收敛（或窗口结束）：恢复 1.0 速率
    if (absDrift <= DRIFT_CONST.IGNORE_SEC) {
      this.softRate = 1;
      this.softUntil = 0;
      if (this.degraded && now - this.lastHardAt >= DRIFT_CONST.HARD_COOLDOWN_MS) {
        this.degraded = false;
      }
      return { drift, absDrift, mode: 'none', targetRate: 1, degraded: this.degraded, seekTo: null };
    }

    const softRate = drift > 0 ? 1 - DRIFT_CONST.SOFT_RATE_DELTA : 1 + DRIFT_CONST.SOFT_RATE_DELTA;

    if (absDrift <= threshold) {
      this.softRate = softRate;
      this.softUntil = now + DRIFT_CONST.SOFT_WINDOW_MS;
      return {
        drift,
        absDrift,
        mode: 'soft',
        targetRate: softRate,
        degraded: this.degraded,
        seekTo: null,
      };
    }

    // 超出硬阈值：检查防抖
    if (now - this.lastHardAt < DRIFT_CONST.HARD_COOLDOWN_MS) {
      this.degraded = true;
      this.softRate = softRate;
      this.softUntil = now + DRIFT_CONST.SOFT_WINDOW_MS;
      return {
        drift,
        absDrift,
        mode: 'soft',
        targetRate: softRate,
        degraded: true,
        seekTo: null,
      };
    }

    this.lastHardAt = now;
    this.hardCount += 1;
    this.softRate = 1;
    this.softUntil = 0;
    return {
      drift,
      absDrift,
      mode: 'hard',
      targetRate: 1,
      degraded: this.degraded,
      seekTo: targetPos,
    };
  }
}

/** 计算跟随端此刻应当对齐到的目标位置 */
export function computeTargetPosition(
  media: { action: 'play' | 'pause'; positionSec: number; rate: number; updatedAtServerMs: number },
  serverNowMs: number,
): number {
  if (media.action !== 'play') return media.positionSec;
  const elapsedSec = Math.max(0, (serverNowMs - media.updatedAtServerMs) / 1000);
  return media.positionSec + elapsedSec * media.rate;
}

/**
 * 一起看（房间）跟随端的校准闸门。
 *
 * 用户实测：「我女朋友加入我房间后，她那边一会儿跟我进度一样、一会儿又往回缩」。
 * 两个原因叠在一起：
 *  1. 目标位置是用**快照那一刻**的 serverNow 算的，可主控每 2 秒才心跳一次、
 *     快照也是 2 秒一次 —— 中间算出来的目标永远慢半拍，于是在"对齐"和"落后"之间反复；
 *  2. 旧阈值是对称的 1.5 秒：只要超前 1.6 秒就往回拖。往回跳最伤观感，
 *     而且播放器解码抖动本身就有几百毫秒。
 *
 * 现在：落后 2 秒立刻追（晚一点看不出来），超前要 6 秒以上才往回拉，
 * 两次 seek 至少隔 6 秒 —— 宁可慢半拍跟着，也不来回抽搐。
 */
export const ROOM_SYNC_GATE = {
  /** 目标位置小于这个值认为主控还没真正开播，不去校准（避免被拽回 0:00） */
  MIN_TARGET_SEC: 1.5,
  /** 落后多少秒开始追 */
  LATE_SEC: 2,
  /** 超前多少秒才允许往回拉 */
  EARLY_SEC: 6,
  /** 两次 seek 的最小间隔 */
  MIN_GAP_MS: 6000,
} as const;

export type RoomSyncReason = 'no-target' | 'in-sync' | 'lag' | 'lead' | 'too-soon';

export interface RoomSyncDecision {
  /** 是否应该 seek 到 targetSec */
  seek: boolean;
  /** 算出来的目标位置（已按 mediaState 推演到"此刻"） */
  targetSec: number;
  /** 当前播放位置 - 目标位置；> 0 表示本地超前 */
  driftSec: number;
  reason: RoomSyncReason;
}

/** 房间跟随端：判断此刻要不要 seek、往哪儿 seek */
export function decideRoomSync(
  curSec: number,
  targetSec: number,
  msSinceLastSeek: number,
): RoomSyncDecision {
  const driftSec = curSec - targetSec;
  if (!(targetSec >= ROOM_SYNC_GATE.MIN_TARGET_SEC)) {
    return { seek: false, targetSec, driftSec, reason: 'no-target' };
  }
  const late = driftSec < 0 && Math.abs(driftSec) > ROOM_SYNC_GATE.LATE_SEC;
  const early = driftSec > 0 && Math.abs(driftSec) > ROOM_SYNC_GATE.EARLY_SEC;
  if (!late && !early) {
    return { seek: false, targetSec, driftSec, reason: 'in-sync' };
  }
  if (msSinceLastSeek < ROOM_SYNC_GATE.MIN_GAP_MS) {
    return { seek: false, targetSec, driftSec, reason: 'too-soon' };
  }
  return { seek: true, targetSec, driftSec, reason: late ? 'lag' : 'lead' };
}
