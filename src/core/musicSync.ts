/**
 * 一起听 · 同步决策（纯函数，可单测）
 *
 * 为什么单独拎出来：真机上出现过三个 bug，全都在"谁说了算"这件事上——
 *   1. 点了暂停，歌还在唱；
 *   2. 有时点暂停没反应（按钮状态和真实播放状态不一致）；
 *   3. 队列里那个小三角和大按钮各显示各的（一个说在播、一个说在停）。
 *
 * 规则（一句话）：**本机刚点的操作优先，其余时间以服务端为准**。
 *  - 本机操作进入"意图窗口"，窗口内服务端说别的也不听（避免回声把自己弹回去）；
 *  - 服务端一旦和意图一致，窗口立刻撤销；
 *  - 对方在我之后又操作了（seq 变大且不是我自己）→ 听对方的；
 *  - 暂停意图的窗口很长（30 秒）：宁可安静，也不要莫名其妙自己响起来。
 */

export type PlayLike = 'play' | 'pause';

export interface PlayIntent {
  want: PlayLike;
  /** 窗口结束时间（ms 时间戳） */
  until: number;
  /** 记下发起时的服务端 seq：之后 seq 变大就说明别人动过 */
  baseSeq: number;
}

/** 暂停意图给多长的保护窗口（ms）；播放意图只需要挡住自己的回声 */
export const PAUSE_INTENT_MS = 30_000;
export const PLAY_INTENT_MS = 5_000;

/**
 * 现在到底该播还是该停。
 *
 * @param action       服务端权威的 action
 * @param intent       本机刚点下的意图（可为空）
 * @param seq          服务端当前 seq
 * @param updatedBySelf 服务端最后一次操作是不是我
 * @param now          当前时间（ms）
 */
export function musicWant(opts: {
  action: PlayLike;
  intent: PlayIntent | null;
  seq: number;
  updatedBySelf: boolean;
  now: number;
}): PlayLike {
  const { action, intent, seq, updatedBySelf, now } = opts;
  const serverWant: PlayLike = action === 'play' ? 'play' : 'pause';
  if (!intent) return serverWant;

  // 对方在我之后动过手 → 听对方的
  if (seq > intent.baseSeq && !updatedBySelf) return serverWant;
  // 服务端已经和我的意图一致 → 窗口完成使命
  if (serverWant === intent.want) return intent.want;
  // 还没过期 → 坚持本机意图（这就是"点了暂停不会再唱"的保证）
  if (now < intent.until) return intent.want;
  // 过期了：以服务端为准，但如果是暂停意图，仍然保持安静更安全
  return intent.want === 'pause' ? 'pause' : serverWant;
}

/** 播放中时，按服务端时间推算"现在应该演到第几秒" */
export function musicTargetPosition(
  music: { action: PlayLike; positionSec: number; updatedAtServerMs: number },
  serverNow: number,
): number {
  if (music.action !== 'play') return Math.max(0, music.positionSec);
  const elapsed = Math.max(0, (serverNow - music.updatedAtServerMs) / 1000);
  return Math.max(0, music.positionSec + elapsed);
}

/** 偏差超过这个秒数才值得跳一下（否则每几百毫秒都在 seek，反而卡） */
export const DRIFT_TOLERANCE_SEC = 1.5;

export function shouldSeek(currentSec: number, targetSec: number, tolerance = 1.5): boolean {
  if (!Number.isFinite(currentSec) || !Number.isFinite(targetSec)) return false;
  return Math.abs(currentSec - targetSec) > tolerance;
}

/** 建立一个意图窗口 */
export function makePlayIntent(want: PlayLike, seq: number, now: number): PlayIntent {
  return {
    want,
    until: now + (want === 'pause' ? PAUSE_INTENT_MS : PLAY_INTENT_MS),
    baseSeq: seq,
  };
}

/**
 * 音频加载失败判定：想播、但一直没拿到时长。
 * 给 7 秒缓冲期（移动网络/隧道刚连上时会慢），超时就认定这条直链有问题。
 */
export const STALL_AFTER_MS = 7_000;

export function isStalled(opts: {
  want: PlayLike;
  durationSec: number;
  loadingSince: number;
  now: number;
}): boolean {
  if (opts.want !== 'play') return false;
  if (opts.durationSec > 0) return false;
  if (opts.loadingSince <= 0) return false;
  return opts.now - opts.loadingSince > STALL_AFTER_MS;
}

/** 队列里点某一首时的行为：同一首 = 播放/暂停切换，别的歌 = 切过去并播放 */
export function tapTrackAction(index: number, currentIndex: number): 'toggle' | 'switch' {
  return index === currentIndex ? 'toggle' : 'switch';
}

/** 一遍放完了该怎么办 */
export type TrackEndPlan =
  | { kind: 'replay' }
  | { kind: 'next'; index: number }
  | { kind: 'idle' };

/** 播放位置是否已经到头（差 0.35 秒以内都算） */
export function isAtEnd(currentSec: number, durationSec: number): boolean {
  if (!(durationSec > 0)) return false;
  return currentSec >= durationSec - 0.35;
}

/**
 * 放完之后做什么。
 *
 * 以前这里漏了：歌放完停在结尾，ExoPlayer 处于 ENDED 状态，
 * 再点播放毫无反应——用户说的"点播放没反应"就是这一类。
 */
export function planTrackEnd(opts: {
  loop: boolean;
  shuffle: boolean;
  queueLength: number;
  index: number;
  random?: () => number;
}): TrackEndPlan {
  const { loop, shuffle, queueLength, index } = opts;
  if (queueLength <= 0) return { kind: 'idle' };
  if (queueLength === 1 || loop) return { kind: 'replay' };
  if (shuffle) {
    const rnd = opts.random ?? Math.random;
    let next = Math.floor(rnd() * queueLength) ;
    if (next === index) next = (next + 1) % queueLength;
    return { kind: 'next', index: next };
  }
  const next = index + 1;
  // 最后一首放完：重头放（不静音、不惩罚，也不偷偷停）
  return next >= queueLength ? { kind: 'replay' } : { kind: 'next', index: next };
}
