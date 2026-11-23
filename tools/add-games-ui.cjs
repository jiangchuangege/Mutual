const fs = require('node:fs');

// ---------- store：游戏库 API ----------
let t = fs.readFileSync('C:/ts/src/store.tsx', 'utf8');
if (!t.includes('addGame(')) {
  const anchor = `  removeComment(target: 'movie' | 'moment', targetId: string, commentId: string): void {`;
  if (!t.includes(anchor)) throw new Error('store 插入点没找到');
  const methods = `  // ---- 游戏库与双人联机 ----

  addGame(title: string, code: string): boolean {
    return this.handle(this.hub.addGame(this.role, { title, code }), '已加入游戏库');
  }

  removeGame(id: string): void {
    this.handle(this.hub.removeGame(this.role, id), '已从游戏库移除');
  }

  startGame(gameId: string): void {
    this.handle(this.hub.startGame(this.role, gameId));
  }

  /** 把局面交给服务端广播（对方 WebView 会收到 TwGame.apply） */
  pushGameState(state: string, turn: number): void {
    const res = this.hub.pushGameState(this.role, state, turn);
    if (res.ok) this.bump();
  }

  endGame(): void {
    this.handle(this.hub.endGame(this.role));
  }

`;
  t = t.replace(anchor, methods + anchor);
  fs.writeFileSync('C:/ts/src/store.tsx', t, 'utf8');
  console.log('store games ok');
}

// ---------- 生活页加入口 ----------
let life = fs.readFileSync('C:/ts/src/app/life.tsx', 'utf8');
if (!life.includes("router.push('/games')")) {
  const cell = `<QuickCell emoji="🎧" label="一起听" onPress={() => router.push('/listen')} />`;
  if (!life.includes(cell)) throw new Error('life.tsx QuickCell 锚点没找到');
  life = life.replace(cell, cell + `\n              <QuickCell emoji="🎮" label="一起玩" onPress={() => router.push('/games')} />`);
  fs.writeFileSync('C:/ts/src/app/life.tsx', life, 'utf8');
  console.log('life entry ok');
}

// ---------- 注册路由（expo-router 是文件路由，但 Stack 里显式声明过） ----------
let layout = fs.readFileSync('C:/ts/src/app/_layout.tsx', 'utf8');
if (!layout.includes('name="games"')) {
  const m = layout.match(/<Stack[\s\S]*?>/);
  console.log('Stack 片段:', m ? 'found' : 'missing');
}
