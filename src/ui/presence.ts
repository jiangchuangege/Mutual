/**
 * 「TA 现在在干什么」—— 在线状态升级版。
 *
 * 需求（用户原话）：
 *   显示对方在不在线；如果他在看电影 → "对方在看电影"；
 *   在听歌 → "对方在听歌，快加入一起听吧"；电视台、FM 也一样。
 *
 * 做法：客户端把当前所在模块（粗粒度的 surface）当作心跳上报给服务器，
 * 服务器存到空间状态里再广播回来。这里只做"路径 → surface"和"surface → 人话"的映射，
 * 不涉及任何内容细节（不上报片名/书名/聊天内容），隐私上和在线状态一个量级。
 */

export type PresenceSurface =
  | 'app'
  | 'cinema'
  | 'room'
  | 'live'
  | 'fm'
  | 'music'
  | 'games'
  | 'other';

export type PartnerPresenceInfo = {
  /** 是否在线（有心跳且不过期） */
  online: boolean;
  /** 头像下面那行短标签："在看电影" */
  chip: string;
  /** 卡片下面那条可点的提示："TA 在看电影，点这里一起看" */
  hint: string | null;
  /** 点提示要去哪 */
  route: string | null;
};

/** 心跳超过这个时间没更新，就当对方不在线（App 被杀/断网） */
export const PRESENCE_STALE_MS = 150_000;

/** 路由 → 模块（顺序有讲究：/cinema-detail 之类都算 cinema） */
export function surfaceFromPath(pathname: string | null | undefined): {
  surface: PresenceSurface;
  route: string | null;
} {
  const p = (pathname ?? '').split('?')[0];
  if (!p) return { surface: 'app', route: null };
  if (p.startsWith('/room')) return { surface: 'room', route: '/room' };
  if (p.startsWith('/cinema')) return { surface: 'cinema', route: '/cinema' };
  if (p.startsWith('/live')) return { surface: 'live', route: '/live' };
  if (p.startsWith('/jiaojiao-fm')) return { surface: 'fm', route: '/jiaojiao-fm' };
  if (p.startsWith('/listen') || p.startsWith('/music')) return { surface: 'music', route: '/listen' };
  if (p.startsWith('/games') || p.startsWith('/voxel')) return { surface: 'games', route: '/games' };
  if (p === '/' || p.startsWith('/index') || p.startsWith('/life') || p.startsWith('/care') || p.startsWith('/us')) {
    return { surface: 'app', route: null };
  }
  return { surface: 'other', route: null };
}

const SURFACE_TEXT: Record<
  PresenceSurface,
  { chip: string; hint: string | null; route: string | null }
> = {
  app: { chip: '在线', hint: null, route: null },
  cinema: { chip: '在看电影', hint: 'TA 在看电影 · 点这里一起看', route: '/cinema' },
  room: { chip: '在观影房间', hint: 'TA 已经在观影房间 · 点这里进去', route: '/room' },
  live: { chip: '在看电视', hint: 'TA 在看电视直播 · 点这里一起看', route: '/live' },
  fm: { chip: '在听焦焦FM', hint: 'TA 在听焦焦FM · 快加入一起听', route: '/jiaojiao-fm' },
  music: { chip: '在听歌', hint: 'TA 在听歌 · 快加入一起听吧', route: '/listen' },
  games: { chip: '在玩游戏', hint: 'TA 在玩游戏 · 点这里一起玩', route: '/games' },
  other: { chip: '在线', hint: null, route: null },
};

function asSurface(raw: string | undefined | null): PresenceSurface {
  if (!raw) return 'app';
  return raw in SURFACE_TEXT ? (raw as PresenceSurface) : 'other';
}

/**
 * 计算"对面那个人"的状态文案。
 *
 * @param partner 服务端下发的 presence（可能没有）
 * @param partnerOnline 服务器认定的在线状态（WS 连接在不在），没有心跳时用它兜底
 * @param now 当前时间（用于判断心跳是否过期）
 */
export function describePartnerPresence(
  partner: { surface?: string; detail?: string | null; at?: number } | undefined,
  partnerOnline: boolean,
  now: number,
): PartnerPresenceInfo {
  const fresh = !!partner && typeof partner.at === 'number' && now - partner.at < PRESENCE_STALE_MS;
  if (!fresh) {
    return {
      online: partnerOnline,
      chip: partnerOnline ? '在线' : '不在线',
      hint: null,
      route: null,
    };
  }
  const surface = asSurface(partner?.surface);
  const meta = SURFACE_TEXT[surface];
  if (surface === 'app' || surface === 'other') {
    return { online: true, chip: '在线', hint: null, route: null };
  }
  return { online: true, chip: meta.chip, hint: meta.hint, route: meta.route };
}
