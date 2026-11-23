/**
 * 全局音频焦点（Audio Focus）。
 *
 * 用户反馈："我放歌，不知道哪里也莫名其妙发出声音，就像两个播放器同时放同一首歌。"
 *
 * 原因是 App 里确实有两条互不相识的音源：
 *   1. 「一起听」的同步播放器（useMusicEngine，跟着服务端队列走）
 *   2. 收藏/相册里的本地预览播放器（CollectionScreen 的 AudioRow）
 * 两条各自 play() 就会叠在一起响。
 *
 * 这里做一个极简的"谁在响"的登记表：任何一方开始播放时 claim 焦点，
 * 其它被登记过的播放器会被自动 pause。规矩简单：**同一时间只允许一个音源发声**。
 */

type Pauser = () => void;

const owners = new Map<string, Pauser>();
let current: string | null = null;

/** 登记一个"能被别人暂停"的播放器 */
export function registerAudioOwner(id: string, pause: Pauser): void {
  owners.set(id, pause);
}

export function unregisterAudioOwner(id: string): void {
  owners.delete(id);
  if (current === id) current = null;
}

/**
 * 抢占焦点：把除自己以外的播放器全部暂停。
 * 返回 true 表示这次是"新拿到焦点"，false 表示本来就在响。
 */
export function claimAudioFocus(id: string): boolean {
  const switched = current !== id;
  for (const [key, pause] of owners) {
    if (key === id) continue;
    try {
      pause();
    } catch {
      // 暂停失败不影响别人
    }
  }
  current = id;
  return switched;
}

/** 自己停了：让出焦点 */
export function releaseAudioFocus(id: string): void {
  if (current === id) current = null;
}

/** 当前是谁在响（调试/界面提示用） */
export function currentAudioOwner(): string | null {
  return current;
}
