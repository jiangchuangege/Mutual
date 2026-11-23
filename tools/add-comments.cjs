const fs = require('node:fs');

// ---------- types.ts ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
const anchor = `  /** 一起看队列（从片库选进来的片子） */
  watchQueue: WatchQueueItem[];`;
if (!t.includes(anchor)) throw new Error('types 锚点没找到');
t = t.replace(
  anchor,
  `  /** 一起看队列（从片库选进来的片子） */
  watchQueue: WatchQueueItem[];
  /**
   * 评论区：**按对象隔离**。key 形如 \`movie:<片id或片名>\` / \`moment:<记录id>\`，
   * 每个对象各自一池，互不串（和弹幕按片源隔离是一个道理）。
   */
  comments: Record<string, CommentItem[]>;`
);
const m = t.match(/export interface WatchQueueItem \{[\s\S]*?\n\}\n/);
if (!m) throw new Error('WatchQueueItem 没找到');
t = t.replace(
  m[0],
  m[0] +
    `
/** 一条评论：影视的影评区、生活点滴的评论区都用它，靠 key 隔离 */
export interface CommentItem {
  id: string;
  byRole: Role;
  text: string;
  at: number;
}
`
);
fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
console.log('types.ts ok');

// ---------- hub.ts ----------
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace('      watchQueue: [],', '      watchQueue: [],\n      comments: {},');
if (!h.includes('comments: {},')) throw new Error('hub state 没加上');
h = h.replace('      watchQueue: this.state.watchQueue,', '      watchQueue: this.state.watchQueue,\n      comments: this.state.comments,');
if (!h.includes('comments: this.state.comments,')) throw new Error('hub snapshot 没加上');
h = h.replace(
  '      watchQueue: (raw as { watchQueue?: WatchQueueItem[] }).watchQueue ?? [],',
  '      watchQueue: (raw as { watchQueue?: WatchQueueItem[] }).watchQueue ?? [],\n' +
    '      // 老存档没有评论区：补空对象，不丢已有数据\n' +
    '      comments: (raw as { comments?: Record<string, CommentItem[]> }).comments ?? {},'
);
if (!h.includes('comments: (raw as { comments?')) throw new Error('hub hydrate 没加上');
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('hub.ts ok');

// ---------- hub 方法：插在 removeWatchQueue 之前 ----------
let h2 = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
const marker = '  /** 从队列移除（谁加的、或任何一方都能移，队列是共享的） */';
if (!h2.includes(marker)) throw new Error('插入点没找到');
const methods = `  // ---- 评论区（每个对象一池，互不串） ----

  /** 评论区的 key：影视按片 id（没有就用片名），点滴按记录 id */
  private commentKey(target: 'movie' | 'moment', targetId: string): string {
    return \`\${target}:\${String(targetId ?? '').trim().slice(0, 80)}\`;
  }

  /** 某个对象下的评论（新的在前） */
  listComments(target: 'movie' | 'moment', targetId: string): CommentItem[] {
    const list = this.state.comments[this.commentKey(target, targetId)] ?? [];
    return [...list].sort((a, b) => b.at - a.at);
  }

  addComment(
    byRole: Role,
    target: 'movie' | 'moment',
    targetId: string,
    text: string,
  ): Result<CommentItem> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    if (!String(targetId ?? '').trim()) return fail('没有指定评论对象');
    const trimmed = String(text ?? '').trim().slice(0, 200);
    if (!trimmed) return fail('说点什么吧');
    const key = this.commentKey(target, targetId);
    const list = this.state.comments[key] ?? [];
    const item: CommentItem = { id: uid('cm'), byRole, text: trimmed, at: this.now() };
    list.push(item);
    // 每个对象最多留 200 条，避免状态无限膨胀（不删其它对象的）
    this.state.comments[key] = list.length > 200 ? list.slice(-200) : list;
    this.logActivity(
      byRole,
      'add',
      target === 'movie' ? 'movieComment' : 'momentComment',
      target === 'movie' ? '影评' : '点滴评论',
      trimmed.slice(0, 20),
    );
    this.notify();
    return ok(item);
  }

  removeComment(
    byRole: Role,
    target: 'movie' | 'moment',
    targetId: string,
    commentId: string,
  ): Result<null> {
    const key = this.commentKey(target, targetId);
    const list = this.state.comments[key] ?? [];
    const hit = list.find((c) => c.id === commentId);
    if (!hit) return fail('这条评论不在了');
    // 只有作者能删自己的
    if (hit.byRole !== byRole) return fail('只能删自己写的评论');
    this.state.comments[key] = list.filter((c) => c.id !== commentId);
    this.notify();
    return ok(null);
  }

`;
h2 = h2.replace(marker, methods + marker);
fs.writeFileSync('C:/ts/src/core/hub.ts', h2, 'utf8');
console.log('hub comments methods ok');
