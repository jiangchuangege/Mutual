const fs = require('node:fs');
const p = 'C:/ts/src/app/games.tsx';
let t = fs.readFileSync(p, 'utf8');

// GamePlayer 里没有 store，改成从父组件传 baseUrl
t = t.replace(
  '            ? { uri: `${(store.remoteServer || \'\').replace(/\\/+$/, \'\')}${game.assetPath}` }',
  '            ? { uri: `${baseUrl}${game.assetPath}` }'
);
t = t.replace(
  `function GamePlayer({
  game,
  width,
  availableHeight,`,
  `function GamePlayer({
  game,
  width,
  availableHeight,
  baseUrl,`
);
t = t.replace(
  `  width: number;
  availableHeight: number;
  stateText: string;`,
  `  width: number;
  availableHeight: number;
  /** 服务器基地址：按网址加载大游戏时用 */
  baseUrl: string;
  stateText: string;`
);
t = t.replace(
  `        <GamePlayer
          game={playing}
          width={width}
          availableHeight={height}`,
  `        <GamePlayer
          game={playing}
          width={width}
          availableHeight={height}
          baseUrl={(store.remoteServer || '').replace(/\\/+$/, '')}`
);
fs.writeFileSync(p, t, 'utf8');
console.log('baseUrl 已传:', t.includes('baseUrl={(store.remoteServer'), t.includes('? { uri: `${baseUrl}'));
