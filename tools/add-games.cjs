const fs = require('node:fs');

// ---------- types.ts：游戏库 + 联机会话 ----------
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
if (!t.includes('games: GameSpec[];')) {
  t = t.replace(
    '  /** 评论区：按 `movie:<id>` / `moment:<id>` 分池，互不串 */\n  comments: Record<string, CommentItem[]>;',
    `  /** 评论区：按 \`movie:<id>\` / \`moment:<id>\` 分池，互不串 */
  comments: Record<string, CommentItem[]>;
  /** 游戏库：粘贴进来的小游戏（HTML 单文件）与内置样例 */
  games: GameSpec[];
  /** 当前这一局双人游戏 */
  gameSession: GameSession | null;`
  );
}
if (!t.includes('export interface GameSpec')) {
  t = t.replace(
    'export interface CommentItem {',
    `/**
 * 一个游戏（存"代码"本身，不存成品）。
 *
 * 用户的做法：去找 DeepSeek 要一段 HTML 小游戏代码 → 粘贴进 App → 一键生成
 * → 存进游戏库 → 双方点开就能一起玩。所以这里只存源码文本。
 */
export interface GameSpec {
  id: string;
  title: string;
  /** 单文件 HTML（含 <script>）；在沙箱 WebView 里跑 */
  code: string;
  /** 玩家人数，1 或 2（我们只做 2 人联机） */
  players: 1 | 2;
  createdBy: Role;
  createdAt: number;
  /** 内置样例不参与"删除"以外的特殊处理，这里留个标记 */
  builtin?: boolean;
}

/** 一局正在进行的双人游戏：shared 是局面，两边都按它渲染 */
export interface GameSession {
  gameId: string;
  title: string;
  /** 局面：任意 JSON（游戏自己解释） */
  state: string;
  /** 谁的回合（0/1 对应两边） */
  turn: number;
  updatedAt: number;
  updatedBy: Role;
  seq: number;
}

export interface CommentItem {`
  );
}
fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
console.log('types ok:', t.includes('export interface GameSpec'), t.includes('games: GameSpec[]'));

// ---------- hub.ts ----------
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace('      comments: {},', '      comments: {},\n      games: [],\n      gameSession: null,');
if (!h.includes('games: [],')) throw new Error('state 初始化失败');
h = h.replace('      comments: this.state.comments,', '      comments: this.state.comments,\n      games: this.state.games,\n      gameSession: this.state.gameSession,');
if (!h.includes('games: this.state.games,')) throw new Error('snapshot 失败');
h = h.replace(
  '      comments: (raw as { comments?: Record<string, CommentItem[]> }).comments ?? {},',
  `      comments: (raw as { comments?: Record<string, CommentItem[]> }).comments ?? {},
      // 老存档没有游戏库/对局：补空，不丢已有数据
      games: (raw as { games?: GameSpec[] }).games ?? [],
      gameSession: (raw as { gameSession?: GameSession | null }).gameSession ?? null,`
);
if (!h.includes('games: (raw as { games?')) throw new Error('hydrate 失败');

// 方法：插在"从队列移除"注释之前（已有位置）
const marker = '  // ---- 评论区（每个对象一池，互不串） ----';
if (!h.includes(marker)) throw new Error('方法插入点没找到');
const methods = `  // ---- 游戏库与双人联机 ----

  /** 粘贴一段代码进游戏库（同一份代码重复粘贴会复用旧的，不产生副本） */
  addGame(byRole: Role, input: { title: string; code: string; players?: 1 | 2 }): Result<GameSpec> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const code = String(input.code ?? '');
    if (code.trim().length < 30) return fail('代码太短了，看起来不是完整的游戏');
    if (code.length > 400_000) return fail('代码太长了（上限 400KB）');
    const title = String(input.title ?? '').trim().slice(0, 40) || '未命名小游戏';
    const dup = this.state.games.find((g) => g.code === code);
    if (dup) return ok(dup);
    const spec: GameSpec = {
      id: uid('game'),
      title,
      code,
      players: input.players === 1 ? 1 : 2,
      createdBy: byRole,
      createdAt: this.now(),
    };
    this.state.games.unshift(spec);
    if (this.state.games.length > 60) this.state.games.length = 60;
    this.logActivity(byRole, 'add', 'game', '游戏库', title);
    this.notify();
    return ok(spec);
  }

  removeGame(byRole: Role, id: string): Result<null> {
    const before = this.state.games.length;
    this.state.games = this.state.games.filter((g) => g.id !== id);
    if (this.state.games.length === before) return fail('游戏库里没有这个游戏');
    if (this.state.gameSession?.gameId === id) this.state.gameSession = null;
    this.logActivity(byRole, 'delete', 'game', '游戏库');
    this.notify();
    return ok(null);
  }

  /** 开一局：把局面清空，轮到发起人 */
  startGame(byRole: Role, gameId: string): Result<GameSession> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const spec = this.state.games.find((g) => g.id === gameId);
    if (!spec) return fail('游戏库里没有这个游戏');
    this.state.gameSession = {
      gameId: spec.id,
      title: spec.title,
      state: '',
      turn: 0,
      updatedAt: this.now(),
      updatedBy: byRole,
      seq: 0,
    };
    this.notify();
    return ok(this.state.gameSession);
  }

  /**
   * 提交局面。
   *
   * 逻辑放在各自的 WebView 里跑（同一份代码、同一个初始局面），
   * 谁操作就有谁把"新局面的 JSON 字符串"交上来，服务端只做存储和广播——
   * 不在服务端 eval 陌生代码，安全边界清楚。
   */
  pushGameState(byRole: Role, state: string, turn?: number): Result<GameSession> {
    const session = this.state.gameSession;
    if (!session) return fail('没有进行中的游戏');
    const text = String(state ?? '');
    if (text.length > 200_000) return fail('局面数据太大了');
    session.state = text;
    session.turn = typeof turn === 'number' ? Math.max(0, Math.min(1, Math.round(turn))) : session.turn;
    session.updatedAt = this.now();
    session.updatedBy = byRole;
    session.seq += 1;
    this.notify();
    return ok(session);
  }

  endGame(_byRole: Role): Result<null> {
    this.state.gameSession = null;
    this.notify();
    return ok(null);
  }

`;
h = h.replace(marker, methods + marker);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('hub games ok');

// import 里补 GameSession / GameSpec
let h2 = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
if (!h2.includes('  GameSession,')) {
  h2 = h2.replace('  GiftIdea,', '  GameSession,\n  GameSpec,\n  GiftIdea,');
  fs.writeFileSync('C:/ts/src/core/hub.ts', h2, 'utf8');
}
console.log('hub imports:', h2.includes('  GameSpec,'));
