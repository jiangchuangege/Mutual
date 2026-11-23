const fs = require('node:fs');

// ============ types：体素世界存档字段 ============
let t = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
if (!t.includes('export interface VoxelWorld')) {
  t = t.replace(
    'export interface CommentItem {',
    `/**
 * 3D 体素世界的**存档**。
 *
 * 只存"和确定性地形不一样的地方"（挖掉的 / 放上去的），格式 \`x,y,z,v\`：
 *  - 世界本体由固定种子生成，两端一致，所以不用存整张地图；
 *  - 一次挖/放只增加一条，几千条也就几十 KB；
 *  - 下次打开、换手机、对方进来，都从这份存档复原（跟联机版我的世界一个思路）。
 */
export interface VoxelWorld {
  /** 改过的格子：x,y,z,方块id */
  edits: string[];
  updatedAt: number;
  updatedBy: Role;
}

export interface CommentItem {`
  );
  // SpaceState + SpaceSnapshot 都加
  t = t.replace(
    '  /** 当前这一局双人游戏 */\n  gameSession: GameSession | null;',
    '  /** 当前这一局双人游戏 */\n  gameSession: GameSession | null;\n  /** 3D 体素世界的存档（两人共用一份） */\n  voxelWorld: VoxelWorld;'
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t, 'utf8');
}
// SpaceSnapshot 里的那一处（第二处出现的地方补上）
let t2 = fs.readFileSync('C:/ts/src/core/types.ts', 'utf8');
const hits = t2.split('gameSession: GameSession | null;').length - 1;
if (hits === 1) {
  t2 = t2.replace(
    '  gameSession: GameSession | null;',
    '  gameSession: GameSession | null;\n  /** 3D 体素世界存档 */\n  voxelWorld: VoxelWorld;'
  );
  fs.writeFileSync('C:/ts/src/core/types.ts', t2, 'utf8');
}
console.log('types: voxelWorld 字段数 =', (t2.match(/voxelWorld: VoxelWorld;/g) || []).length);

// ============ hub：字段 + 存档方法 ============
let h = fs.readFileSync('C:/ts/src/core/hub.ts', 'utf8');
h = h.replace("      games: [],\n      gameSession: null,", "      games: [],\n      gameSession: null,\n      voxelWorld: { edits: [], updatedAt: 0, updatedBy: 'A' },");
h = h.replace('      games: this.state.games,\n      gameSession: this.state.gameSession,', '      games: this.state.games,\n      gameSession: this.state.gameSession,\n      voxelWorld: this.state.voxelWorld,');
h = h.replace(
  "      gameSession: (raw as { gameSession?: GameSession | null }).gameSession ?? null,",
  "      gameSession: (raw as { gameSession?: GameSession | null }).gameSession ?? null,\n      voxelWorld:\n        (raw as { voxelWorld?: VoxelWorld }).voxelWorld ?? { edits: [], updatedAt: 0, updatedBy: 'A' },"
);
h = h.replace('  GameSession,\n  GameSpec,', '  GameSession,\n  GameSpec,\n  VoxelWorld,');

const marker = '  // ---- 评论区（每个对象一池，互不串） ----';
if (!h.includes(marker)) throw new Error('hub 插入点没找到');
const methods = `  // ---- 3D 体素世界存档 ----

  /**
   * 合并一批改动进存档（一次挖/放就一条 \`x,y,z,v\`，同一格以后来的为准）。
   * 上限 3 万条：够建一座小城堡，也不会把状态撑爆。
   */
  mergeVoxelEdits(byRole: Role, edits: string[]): Result<{ count: number }> {
    const bound = this.requireBound();
    if (!bound.ok) return fail(bound.error);
    const incoming = Array.isArray(edits) ? edits : [];
    const valid = incoming.filter((e) => typeof e === 'string' && /^-?\\d+,-?\\d+,-?\\d+,\\d+$/.test(e));
    if (valid.length === 0) return ok({ count: this.state.voxelWorld.edits.length });
    const map = new Map<string, string>();
    const keyOf = (e: string) => {
      const p = e.split(',');
      return p[0] + ',' + p[1] + ',' + p[2];
    };
    for (const e of this.state.voxelWorld.edits) map.set(keyOf(e), e);
    for (const e of valid) map.set(keyOf(e), e);
    let next = [...map.values()];
    if (next.length > 30000) next = next.slice(-30000);
    this.state.voxelWorld = { edits: next, updatedAt: this.now(), updatedBy: byRole };
    this.notify();
    return ok({ count: next.length });
  }

  /** 清空存档（回到刚生成的地形） */
  resetVoxelWorld(byRole: Role): Result<null> {
    this.state.voxelWorld = { edits: [], updatedAt: this.now(), updatedBy: byRole };
    if (this.state.gameSession) this.state.gameSession = null;
    this.logActivity(byRole, 'delete', 'game', '3D 世界存档');
    this.notify();
    return ok(null);
  }

`;
h = h.replace(marker, methods + marker);
fs.writeFileSync('C:/ts/src/core/hub.ts', h, 'utf8');
console.log('hub: voxel 存档方法已加');

// ============ store：包装 ============
let st = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!st.includes('mergeVoxelEdits')) {
  st = st.replace(
    `  startGame(gameId: string): void {`,
    `  /** 3D 沙盒的存档条目（x,y,z,v），打开世界时用来复原 */
  get voxelEdits(): string[] {
    return this.snapshot.voxelWorld?.edits ?? [];
  }

  /** 把这次挖/放的增量并进存档（服务端权威，双方同一份） */
  mergeVoxelEdits(edits: string[]): void {
    if (!edits.length) return;
    const res = this.hub.mergeVoxelEdits(this.role, edits);
    if (res.ok) this.bump();
  }

  resetVoxelWorld(): void {
    this.handle(this.hub.resetVoxelWorld(this.role), '存档已清空，回到初始地形');
  }

  startGame(gameId: string): void {`
  );
  fs.writeFileSync('C:/ts/src/store.tsx', st, 'utf8');
  console.log('store: voxel 包装已加');
}
