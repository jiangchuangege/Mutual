const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// 1) 打开 3D 沙盒时：把存档当初始局面灌进去（新建对局 + 存档复原）
if (!t.includes('voxelEdits')) {
  t = t.replace(
    `                if (!canPlayInline(g)) return;
                if (snapshot.gameSession?.gameId === g.id) {
                  setPlaying(g);
                  lockLandscape(true);
                  return;
                }
                store.startGame(g.id);
                setPlaying(g);
                lockLandscape(true);`,
    `                if (!canPlayInline(g)) return;
                const isVoxel = g.builtin === 'voxel3d';
                if (snapshot.gameSession?.gameId === g.id) {
                  if (isVoxel) restoreVoxel();
                  setPlaying(g);
                  lockLandscape(true);
                  return;
                }
                store.startGame(g.id);
                if (isVoxel) restoreVoxel();
                setPlaying(g);
                lockLandscape(true);`
  );

  // 复原函数：把存档里的 x,y,z,v 变成 e:[[x,y,z,v]] 交给同一套广播通道
  t = t.replace(
    `  const session = snapshot.gameSession;`,
    `  /**
   * 把 3D 世界的存档灌进这一局。
   *
   * 存档存的是"和确定性地形不同的格子"（x,y,z,v），这里转成游戏认识的
   * {e:[[x,y,z,v]...]} 走同一条广播通道 —— 所以对方一进来也是同一座世界。
   */
  const restoreVoxel = () => {
    const edits = store.voxelEdits;
    if (!edits.length) return;
    const e = edits
      .map((s) => s.split(',').map((n) => Number(n)))
      .filter((a) => a.length === 4 && a.every((n) => Number.isFinite(n)));
    if (!e.length) return;
    store.pushGameState(JSON.stringify({ e, m: 3 }), 0);
  };

  const session = snapshot.gameSession;`
  );

  // 2) 每次收到游戏的增量 → 同时并进存档
  const oldState = `          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as { turn?: number };
              if (typeof parsed.turn === 'number') turn = Math.max(0, Math.min(1, parsed.turn));
            } catch {
              // 局面不是 JSON 就沿用服务端的回合
            }
            store.pushGameState(state, turn);
          }}`;
  const newState = `          onState={(state) => {
            let turn = session?.turn ?? 0;
            try {
              const parsed = JSON.parse(state) as {
                turn?: number;
                e?: number[][];
              };
              if (typeof parsed.turn === 'number') turn = Math.max(0, Math.min(1, parsed.turn));
              // 3D 沙盒：把这批挖/放并进存档，下次打开还在
              if (Array.isArray(parsed.e) && parsed.e.length > 0) {
                store.mergeVoxelEdits(
                  parsed.e
                    .filter((a) => Array.isArray(a) && a.length === 4)
                    .map((a) => a.map((n) => Math.round(Number(n) || 0)).join(',')),
                );
              }
            } catch {
              // 局面不是 JSON 就沿用服务端的回合
            }
            store.pushGameState(state, turn);
          }}`;
  if (!t.includes(oldState)) throw new Error('onState 未找到');
  t = t.replace(oldState, newState);

  // 3) 游戏库里给 3D 沙盒加一个"清空存档"的长按菜单
  t = t.replace(
    `              onLongPress={() => {
                if (g.builtin) {
                  toast.show('内置样例不用删，粘贴的才需要');
                  return;
                }`,
    `              onLongPress={() => {
                if (g.builtin === 'voxel3d') {
                  void confirm({
                    title: '清空 3D 世界存档？',
                    message: \`现在存档里有 \${store.voxelEdits.length} 个改动。清空后世界回到初始地形（包括情侣小院），两人都一样。\`,
                    confirmText: '清空',
                    danger: true,
                  }).then((ok) => {
                    if (ok) store.resetVoxelWorld();
                  });
                  return;
                }
                if (g.builtin) {
                  toast.show('内置样例不用删，粘贴的才需要');
                  return;
                }`
  );

  // 4) 卡片上显示存档规模
  t = t.replace(
    `                {g.builtin ? (g.builtin === 'voxel3d' ? '3D 内置' : '内置样例') : kindBadge(g.kind ?? 'html')}`,
    `                {g.builtin === 'voxel3d'
                  ? \`3D · 存档 \${store.voxelEdits.length} 块\`
                  : g.builtin
                    ? '内置样例'
                    : kindBadge(g.kind ?? 'html')}`
  );

  fs.writeFileSync(p, t, 'utf8');
  console.log('games.tsx 已接存档:', {
    复原: t.includes('restoreVoxel'),
    合并存档: t.includes('mergeVoxelEdits'),
    清空存档: t.includes('resetVoxelWorld'),
    卡片计数: t.includes('存档 ${store.voxelEdits.length} 块'),
  });
} else {
  console.log('已接入');
}
