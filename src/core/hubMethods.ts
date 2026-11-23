/**
 * Hub 方法的调用约定：哪些只能在本机跑，哪些可以转发给服务器。
 *
 * 背景（真实事故）：`hub.tick()` 每 250ms 被调一次，它**没有 role 参数**。
 * 之前它不在"只在本机跑"的名单里，于是远程模式下 facade 把它当业务请求发给服务器：
 * `POST /api/rpc {role: undefined, method:"tick"}` → 服务器回「缺少 role」→
 * 界面上每 250ms 弹一次错误，看起来像"疯掉"。
 *
 * 所以把清单放到 core 里：
 *  - store 用它决定要不要转发；
 *  - 测试用它**静态扫描** store.tsx，确保不会再有"不带 role 却转发"的调用混进来。
 */

/** 第一个参数不是 role 的 Hub 方法：永远不能转发给服务器 */
export const ROLE_LESS_HUB_METHODS: readonly string[] = [
  'now',
  'scaled',
  'tick',
  'snapshot',
  'serialize',
  'hydrate',
  'hydrateProjected',
  'subscribe',
  'resetToEmpty',
  'seedDemo',
  'voiceChannelName',
  'fastForwardCooling',
  'devSkipOfflineTo',
];

/**
 * 只在本机执行的方法（不发给服务器）。
 *
 * 除了上面那批没有 role 的，还包括"读派生值"的方法：这些方法在服务端算和在本地算
 * 结果一样（或者本来就只对本机有意义），发过去纯属浪费一次往返。
 */
export const LOCAL_ONLY_HUB_METHODS: readonly string[] = [
  ...ROLE_LESS_HUB_METHODS,
  'clockPing',
  'toDeviceClock',
  'setScaleHint',
  'nextMusicIndex',
  'currentChoreAssignee',
  'ledgerBalance',
  'pickMatches',
  'collectionDrawRandom',
  'ageFromBirthDate',
];

/** 这个方法的第一参数是不是合法 role */
export function isRoleArg(value: unknown): value is 'A' | 'B' {
  return value === 'A' || value === 'B';
}

/**
 * 幂等的"赋值类"方法：远程模式下**先在本机执行一遍**再转发。
 *
 * 为什么需要：远程模式里写操作只发给服务器，本地状态要等服务器的快照回来才更新。
 * 结果就是点了「完成建档」之后界面毫无反应（要等一个往返），用户会以为按钮坏了；
 * 更糟的是长连接恰好不健康时，这条 RPC 会真的丢掉，于是永远进不去。
 * 这些方法都是"把某个字段设成某个值"，本地执行一次不会产生重复数据，
 * 等服务端快照回来再覆盖一次即可。
 */
export const LOCAL_OPTIMISTIC_METHODS: readonly string[] = [
  'updateMyProfile',
  'setMyAvatar',
  'setBackground',
  'setStartedAt',
];

/**
 * 这次调用该不该转发到服务器。
 * 判定顺序：只在本机 → 不是；第一个参数不是 role → 不转发（保命）；否则转发。
 */
export function shouldForwardToServer(method: string, args: unknown[]): boolean {
  if (LOCAL_ONLY_HUB_METHODS.includes(method)) return false;
  return isRoleArg(args[0]);
}
