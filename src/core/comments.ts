import type { CommentItem } from './types';

/**
 * 评论区的 key 与读取。
 *
 * 用户要求：「每个影视、每个生活点滴记录都加评论区，评论区一定是隔离的不要串，
 * 就和我们一起看电影的弹幕一样。」
 *
 * 所以评论**不放在对象内部**，而是按 `target:id` 分池存放：
 *   - `movie:<片 id 或片名>`  一部片一池
 *   - `moment:<记录 id>`       一条点滴一池
 * 换片、换记录只会读到自己的池子，物理上不可能串。
 */
export type CommentTarget = 'movie' | 'moment';

export function commentKeyOf(target: CommentTarget, targetId: string): string {
  return `${target}:${String(targetId ?? '').trim().slice(0, 80)}`;
}

/** 取某个对象的评论（新的在前），并把脏数据挡在外头 */
export function commentsOf(
  map: Record<string, CommentItem[]> | null | undefined,
  target: CommentTarget,
  targetId: string,
): CommentItem[] {
  if (!map || !targetId) return [];
  const list = map[commentKeyOf(target, targetId)];
  if (!Array.isArray(list)) return [];
  return [...list]
    .filter((c) => c && typeof c.text === 'string' && c.text.trim().length > 0)
    .sort((a, b) => b.at - a.at);
}

/** 某个对象下的评论条数（列表页显示"3 条评论"用） */
export function commentCount(
  map: Record<string, CommentItem[]> | null | undefined,
  target: CommentTarget,
  targetId: string,
): number {
  return commentsOf(map, target, targetId).length;
}
