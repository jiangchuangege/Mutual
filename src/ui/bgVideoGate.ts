/**
 * 「正在播视频」时把背景壁纸视频停掉。
 *
 * 为什么需要：进入观影房间/直播播放后，AppFrame 的背景 MP4 还在循环播放 ——
 * 于是手机同时解码两路视频、抢同一条网络，表现就是**看片卡、声音断续**。
 * 规则很简单：任何全屏播放器挂载时把背景视频抑制掉，退出播放器再恢复。
 * 背景壁纸本身不会消失（首帧 poster 还在），只是不再动、不再占解码器和带宽。
 */
let activeCount = 0;
const listeners = new Set<(suppressed: boolean) => void>();

export function isBackgroundVideoSuppressed(): boolean {
  return activeCount > 0;
}

/** 挂载播放器时 on=true，卸载时 on=false（计数式，多个播放器也不会互相踩） */
export function setBackgroundVideoSuppressed(on: boolean): void {
  activeCount = Math.max(0, activeCount + (on ? 1 : -1));
  const suppressed = activeCount > 0;
  for (const listener of listeners) listener(suppressed);
}

/** 订阅（AppFrame 用）：被抑制时不要渲染背景视频 */
export function subscribeBackgroundVideoSuppressed(
  listener: (suppressed: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
