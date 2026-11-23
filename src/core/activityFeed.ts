/**
 * 「TA 刚才做了什么」的本地已读位置。
 *
 * 服务端会把对方的每一次新增/修改/删除放进快照的 `activity` 里，
 * 客户端只需要回答一个问题：这一条我提醒过没有？
 * 记住"最后提醒到的时间点"就够了——比记住一堆 id 更省事，也不会无限长。
 *
 * 没有这一步的话，每次重连/重开 App 都会把最近 60 条动态重新弹一遍。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVITY_SEEN_KEY = 'twospace::activity-seen-at';

export async function loadActivitySeenAt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_SEEN_KEY);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveActivitySeenAt(at: number): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVITY_SEEN_KEY, String(Math.max(0, Math.floor(at))));
  } catch {
    // 存不上就算了：最坏情况是下次又多弹一次提醒，不影响数据
  }
}

/** 一条动态在提示框里长什么样：「TA 新增了日记「今天很开心」」 */
export function activityToToast(
  item: { action: string; entityLabel: string; title: string },
  who = 'TA',
): string {
  const verb =
    item.action === 'add'
      ? '新增'
      : item.action === 'delete'
        ? '删除'
        : item.action === 'done'
          ? '完成'
          : '修改';
  const title = item.title ? `「${item.title}」` : '';
  return `${who} ${verb}了${item.entityLabel}${title}`;
}
