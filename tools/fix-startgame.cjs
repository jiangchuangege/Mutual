const fs = require('node:fs');
const p = 'C:/ts/src/core/hub.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `    const spec = this.state.games.find((g) => g.id === gameId);
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
    return ok(this.state.gameSession);`;
const to = `    const spec = this.state.games.find((g) => g.id === gameId);
    if (!spec) return fail('游戏库里没有这个游戏');
    /*
     * 同一个游戏再次打开 = 继续这一局，不能把存档清掉。
     * （以前这里每次都重置成 state:'' —— 于是"退出去再进来"世界就回默认值，
     *   金币回到初始 520、田地动物全没了。存档在 pushGameState 里递增 seq。）
     */
    const cur = this.state.gameSession;
    if (cur && cur.gameId === spec.id) {
      this.notify();
      return ok(cur);
    }
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
    return ok(this.state.gameSession);`;
if (!t.includes(from)) throw new Error('找不到 startGame 重置块');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('startGame 不再清空同局存档（这是退进回 520 的根因）');
