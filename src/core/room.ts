/**
 * 电影院房间状态机（方案 §2.2，纯函数、可测试）
 * 任何非法迁移都会被拒绝，不允许"静默改状态"。
 */

import type { RoomEvent, RoomState } from './types';

export const TERMINAL_STATES: RoomState[] = ['RECAP', 'DISSOLVED', 'EXPIRED'];

export const ROOM_TRANSITIONS: Record<RoomState, Partial<Record<RoomEvent, RoomState>>> = {
  CREATED: {
    INVITE_SHARED: 'WAITING_PEER',
    PEER_OPENED: 'WAITING_PEER',
    PEER_REQUESTED: 'PEER_REQUESTED',
    PEER_JOINED: 'PREPARING',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
    INVITE_EXPIRED: 'EXPIRED',
  },
  WAITING_PEER: {
    PEER_OPENED: 'WAITING_PEER',
    PEER_DECLINED: 'WAITING_PEER',
    // 情侣已经绑定，对方点「加入」就是申请；房主点同意才真正进来
    PEER_REQUESTED: 'PEER_REQUESTED',
    PEER_JOINED: 'PREPARING',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
    INVITE_EXPIRED: 'EXPIRED',
  },
  /** 有人申请加入，等房主处理 */
  PEER_REQUESTED: {
    PEER_APPROVED: 'PREPARING',
    PEER_DECLINED: 'WAITING_PEER',
    PEER_JOINED: 'PREPARING',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
    INVITE_EXPIRED: 'EXPIRED',
  },
  PREPARING: {
    PEER_OFFLINE: 'PEER_OFFLINE',
    BOTH_READY: 'COUNTDOWN',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
    INVITE_EXPIRED: 'EXPIRED',
  },
  COUNTDOWN: {
    COUNTDOWN_DONE: 'PLAYING',
    PEER_OFFLINE: 'PEER_OFFLINE',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
  },
  PLAYING: {
    PAUSE: 'PAUSED',
    SEEK: 'PLAYING',
    PLAY: 'PLAYING',
    LEADER_TIMEOUT: 'PLAYING',
    PEER_OFFLINE: 'PEER_OFFLINE',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
  },
  PAUSED: {
    PLAY: 'PLAYING',
    SEEK: 'PAUSED',
    PAUSE: 'PAUSED',
    LEADER_TIMEOUT: 'PAUSED',
    PEER_OFFLINE: 'PEER_OFFLINE',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
    ROOM_TIMEOUT: 'ENDED',
  },
  PEER_OFFLINE: {
    PEER_ONLINE_PLAYING: 'PLAYING',
    PEER_ONLINE_PAUSED: 'PAUSED',
    RECONNECT_TIMEOUT: 'WAITING_RECONNECT',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
  },
  WAITING_RECONNECT: {
    PEER_ONLINE_PLAYING: 'PLAYING',
    PEER_ONLINE_PAUSED: 'PAUSED',
    ROOM_TIMEOUT: 'ENDED',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
  },
  ENDED: {
    SAVE_RECAP: 'RECAP',
    END: 'ENDED',
    CANCEL: 'DISSOLVED',
  },
  // 回忆卡阶段也允许解散：用户看完、评完分、想开下一场，必须能把这个房间收掉
  RECAP: { CANCEL: 'DISSOLVED' },
  DISSOLVED: {},
  EXPIRED: {},
};

export function transition(state: RoomState, event: RoomEvent): RoomState | null {
  const next = ROOM_TRANSITIONS[state][event];
  return next ?? null;
}

export function isTerminal(state: RoomState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function isActiveRoom(state: RoomState): boolean {
  return !isTerminal(state);
}

export interface TransitionResult {
  ok: boolean;
  from: RoomState;
  to: RoomState;
  event: RoomEvent;
  error?: string;
}

export class RoomMachine {
  private current: RoomState;

  constructor(initial: RoomState = 'CREATED') {
    this.current = initial;
  }

  get state(): RoomState {
    return this.current;
  }

  apply(event: RoomEvent): TransitionResult {
    const from = this.current;
    const to = transition(from, event);
    if (to === null) {
      return {
        ok: false,
        from,
        to: from,
        event,
        error: `非法迁移：${from} --${event}-->`,
      };
    }
    this.current = to;
    return { ok: true, from, to, event };
  }

  can(event: RoomEvent): boolean {
    return transition(this.current, event) !== null;
  }
}

/** 主链路可达性自检（供 UI/测试使用） */
export const HAPPY_PATH: Array<[RoomState, RoomEvent, RoomState]> = [
  ['CREATED', 'INVITE_SHARED', 'WAITING_PEER'],
  ['WAITING_PEER', 'PEER_JOINED', 'PREPARING'],
  ['PREPARING', 'BOTH_READY', 'COUNTDOWN'],
  ['COUNTDOWN', 'COUNTDOWN_DONE', 'PLAYING'],
  ['PLAYING', 'PAUSE', 'PAUSED'],
  ['PAUSED', 'PLAY', 'PLAYING'],
  ['PLAYING', 'END', 'ENDED'],
  ['ENDED', 'SAVE_RECAP', 'RECAP'],
];

export const RECONNECT_PATH: Array<[RoomState, RoomEvent, RoomState]> = [
  ['PLAYING', 'PEER_OFFLINE', 'PEER_OFFLINE'],
  ['PEER_OFFLINE', 'PEER_ONLINE_PLAYING', 'PLAYING'],
  ['PEER_OFFLINE', 'RECONNECT_TIMEOUT', 'WAITING_RECONNECT'],
  ['WAITING_RECONNECT', 'PEER_ONLINE_PLAYING', 'PLAYING'],
  ['WAITING_RECONNECT', 'ROOM_TIMEOUT', 'ENDED'],
];
